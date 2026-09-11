import assert from "assert";
import fs from "fs";
import path from "path";
import { SimpleInputAdapterService } from "./service/SimpleInputAdapterService";
import { ProductRoutingEntry, RoutingResultSchema, SimpleInputRequestV1 } from "./types";

/**
 * Content Message separation.
 *
 * The property that carries this change: text the user asks for becomes
 * *authorized copy*, not prose buried in a brief. `copyItems` is what drives
 * TYPOGRAPHY & READABLE COPY in the compiler and `rendersCopy` in the layout
 * service — with it empty the layout reserves blank zones and the prompt tells
 * the renderer no text is drawn this pass. That is the failure a user hits when
 * they type their offer into the concept box, and it is what these tests check.
 *
 * The UI wiring is checked by reading the files, because a field that is never
 * rendered or never sent cannot be caught by a runtime assertion — which is
 * exactly how the visual control panel shipped unmounted earlier in this work.
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

const routing = {
  routing_version: "1.0",
  routing_mode: "HIGH_CONFIDENCE",
  requires_universal_core: true,
  routing_summary: "fixture",
  global_retrieval_queries: [{ query: "product", importance: "PRIMARY", reason: "std" }],
  products: [
    { product_id: "PRODUCT_01", product_name: "Sản phẩm", reference_ids: ["REF_01"], retrieval_queries: [] },
  ] as unknown as ProductRoutingEntry[],
} as unknown as RoutingResultSchema;

function adapt(extra: Partial<SimpleInputRequestV1>) {
  return SimpleInputAdapterService.adapt(
    {
      concept: "Ảnh sản phẩm",
      useCase: "Poster",
      aspectRatio: "4:5",
      images: [{ reference_id: "REF_01", filename: "p.png", mimeType: "image/png" }],
      ...extra,
    } as SimpleInputRequestV1,
    routing
  );
}

console.log("\nContent Message separation\n");

// ── Wiring: the field exists end to end ───────────────────────────────────

check("The field is rendered in the real brief panel", () => {
  const panel = read("features/picture-engine/components/brief/CreativeBriefPanel.tsx");
  assert.ok(/Nội dung muốn xuất hiện trên ảnh/.test(panel), "the section is not in the UI");
  assert.ok(/onUpdateContentMessage/.test(panel), "the field does not write back to state");
  assert.ok(/brief\.content_message/.test(panel), "the field does not read from state");
});

check("It sits above the visual direction panel", () => {
  const panel = read("features/picture-engine/components/brief/CreativeBriefPanel.tsx");
  const content = panel.indexOf("Nội dung muốn xuất hiện trên ảnh");
  const visual = panel.indexOf("<VisualDirectionControlPanel");
  const cta = panel.indexOf("{/* Submit CTA */}");
  assert.ok(content > 0 && content < visual, "content message is not above the visual direction panel");
  assert.ok(visual < cta, "the visual panel is no longer before Generate");
});

check("The container and API service carry it to the server", () => {
  const container = read("features/picture-engine/containers/CreativeBriefPanelContainer.tsx");
  assert.ok(/onUpdateContentMessage=/.test(container), "the container does not wire the handler");
  const api = read("features/picture-engine/services/picture-engine.api.ts");
  assert.ok(/formData\.append\("contentMessage"/.test(api), "the API service does not send it");
  const route = read("app/api/image/generate-simple/route.ts");
  assert.ok(/contentMessage/.test(route), "the route drops it");
});

check("No design vocabulary is shown to the user", () => {
  const panel = read("features/picture-engine/components/brief/CreativeBriefPanel.tsx");
  const section = panel.slice(
    panel.indexOf("Nội dung muốn xuất hiện trên ảnh"),
    panel.indexOf("<VisualDirectionControlPanel")
  );
  for (const jargon of ["headline", "subheadline", "CTA", "typography", "hierarchy"]) {
    assert.ok(!new RegExp(jargon, "i").test(section), `the field exposes "${jargon}" to the user`);
  }
});

// ── The engine turns plain text into authorized copy ──────────────────────

check("Content message becomes authorized copy", () => {
  const a = adapt({ contentMessage: "Khai trương giảm 20%" });
  assert.ok(a.success, "adapter rejected the request");
  assert.ok(
    a.copyItems.some((c) => c.text === "Khai trương giảm 20%"),
    `copy not authorized: ${JSON.stringify(a.copyItems)}`
  );
});

check("Roles are inferred without the user naming them", () => {
  const a = adapt({ contentMessage: ["Khai trương giảm 20%", "Mua ngay", "Hotline 0900 123 456"].join("\n") });
  const byText = new Map(a.copyItems.map((c) => [c.text, c.type]));
  assert.strictEqual(byText.get("Khai trương giảm 20%"), "headline", JSON.stringify([...byText]));
  assert.strictEqual(byText.get("Mua ngay"), "cta", JSON.stringify([...byText]));
  assert.ok(byText.has("Hotline 0900 123 456"), "contact line was dropped");
});

check("The requirement reaches the compiler brief with its purpose", () => {
  const a = adapt({ contentMessage: "Khai trương giảm 20%" });
  assert.ok(/CONTENT MESSAGE — TEXT THAT MUST APPEAR IN THE IMAGE/.test(a.compilerBrief));
  assert.ok(/Main message: Khai trương giảm 20%/.test(a.compilerBrief));
  assert.ok(/Purpose: Promotional communication/.test(a.compilerBrief), a.compilerBrief.slice(-400));
  assert.ok(/Offer figure to reproduce exactly: 20%/.test(a.compilerBrief), "the discount was not isolated");
  assert.ok(/render this text legibly/.test(a.compilerBrief), "no visual requirement was stated");
});

check("An empty content message changes nothing", () => {
  const none = adapt({});
  const empty = adapt({ contentMessage: "   " });
  assert.strictEqual(empty.copyItems.length, none.copyItems.length);
  assert.ok(!/CONTENT MESSAGE/.test(empty.compilerBrief), "an empty field still emitted a section");
});

check("Concept and content message stay separate", () => {
  // The concept describes why; the content message describes what must be read.
  const a = adapt({
    concept: "Tôi mới mở quán cafe, muốn nhiều người biết đến, tuần đầu giảm giá.",
    contentMessage: "Khai trương giảm 20%",
  });
  assert.ok(/CONTENT MESSAGE/.test(a.compilerBrief), "no content section");
  // The concept is not promoted to copy; only the content message is.
  assert.ok(
    !a.copyItems.some((c) => c.text.includes("Tôi mới mở quán cafe")),
    "the concept leaked into authorized copy"
  );
});

// ── The three user types from the brief ───────────────────────────────────

check("CASE 1 — normal user", () => {
  const a = adapt({
    concept: "Tôi mới mở quán cafe, muốn nhiều người biết đến, tuần đầu giảm giá.",
    contentMessage: "Khai trương giảm 20%",
    useCase: "Poster",
  });
  assert.ok(a.copyItems.length > 0, "no text will be rendered");
  assert.ok(/Purpose: Promotional communication/.test(a.compilerBrief));
  assert.ok(/20%/.test(a.compilerBrief), "the offer figure was lost");
});

check("CASE 2 — marketing user", () => {
  const a = adapt({
    concept: "Premium skincare campaign targeting women 35-55",
    contentMessage: "New anti-aging serum",
    useCase: "Poster",
  });
  assert.ok(a.copyItems.some((c) => c.text === "New anti-aging serum"));
  assert.ok(/Main message: New anti-aging serum/.test(a.compilerBrief));
  // No offer was stated, so none is invented.
  assert.ok(!/Offer figure/.test(a.compilerBrief), "an offer was invented");
});

check("CASE 3 — designer / agency", () => {
  const a = adapt({
    concept: "Tet campaign for Vietnamese tea brand. Warm family connection.",
    contentMessage: "Bring warmth home",
    useCase: "Poster",
  });
  assert.ok(a.copyItems.some((c) => c.text === "Bring warmth home"));
  assert.ok(/Main message: Bring warmth home/.test(a.compilerBrief));
  assert.ok(/Purpose: Brand communication/.test(a.compilerBrief), a.compilerBrief.slice(-300));
});

console.log("\n" + "=".repeat(74));
console.log(`${passed} passed, ${failed} failed`);
console.log("=".repeat(74));
if (failed > 0) {
  console.log("\nFailures:");
  failures.forEach((f) => console.log("  - " + f));
  process.exit(1);
}
