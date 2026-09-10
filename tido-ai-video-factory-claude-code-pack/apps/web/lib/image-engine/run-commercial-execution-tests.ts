import assert from "assert";
import { CommercialCopySynthesizer } from "./director/CommercialCopySynthesizer";
import { ConceptStructuringLayer } from "./director/ConceptStructuringLayer";
import { CreativeDirectorPipeline } from "./director/CreativeDirectorPipeline";
import { DirectorBrief, V3_BUDGET } from "./director/creative-director.types";

/**
 * CIOS Phase 4.1.1 verification.
 *
 * The production failure is the first test and it is the one that matters: a
 * concept asking for a 50%-off poster with a CTA produced a clean product shot
 * with neither the number nor the words anywhere in the prompt.
 *
 * The rest guard specific mistakes found while building this: `\b` silently
 * failing on Vietnamese, an umbrella offer term pre-empting a more specific one,
 * and a synthesizer inventing a sale for a brief that never mentioned one.
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

const PRODUCTION_CONCEPT = "Tạo ảnh poster, sale sản phẩm 50% và có các chữ CTA";

const BRIEF: DirectorBrief = {
  brand: "Tido",
  product: "Kem dưỡng da",
  audience: "khách hàng nữ 25-40",
  category: "mỹ phẩm",
  brief_text: "",
  format: "poster",
  aspect_ratio: "4:5",
};

console.log("\nCIOS Phase 4.1.1 — concept to commercial execution\n");

// ── Task 1: the concept is parsed for requirements ────────────────────────

check("The production concept parses into commercial requirements", () => {
  const i = ConceptStructuringLayer.parse(PRODUCTION_CONCEPT);
  assert.strictEqual(i.asset_type, "poster");
  assert.strictEqual(i.offer_type, "sale");
  assert.strictEqual(i.discount, "50%");
  assert.strictEqual(i.cta_required, true);
  assert.strictEqual(i.text_required, true);
  assert.strictEqual(i.commercial_goal, "conversion");
  assert.strictEqual(i.promotional, true);
});

check("Vietnamese offer terms ending in a non-ASCII letter are detected", () => {
  // `\b` is ASCII-only, so /\bgiảm\s?giá\b/ never matches "giảm giá". Case 3 of
  // the benchmark parsed as having no offer at all because of this.
  for (const [concept, expected] of [
    ["Tạo social ad giảm giá có hook mạnh", "sale"],
    ["banner ưu đãi cuối tuần", "sale"],
    ["poster khuyến mãi lớn", "sale"],
  ] as const) {
    assert.strictEqual(ConceptStructuringLayer.parse(concept).offer_type, expected, `"${concept}"`);
  }
});

check("A specific occasion outranks the umbrella offer word", () => {
  // "ưu đãi khai trương" is an opening promotion. With the generic term tested
  // first it resolved to a plain sale and the headline lost the occasion.
  const i = ConceptStructuringLayer.parse("Tạo banner website ưu đãi khai trương, có headline và nút CTA");
  assert.strictEqual(i.offer_type, "launch", `evidence: ${i.evidence.join(" | ")}`);
});

check("The discount is captured exactly as written", () => {
  assert.strictEqual(ConceptStructuringLayer.parse("giảm 30%").discount, "30%");
  assert.strictEqual(ConceptStructuringLayer.parse("sale 50% hôm nay").discount, "50%");
  assert.ok(/mua\s?1\s?tặng\s?1/i.test(ConceptStructuringLayer.parse("mua 1 tặng 1").discount || ""));
});

check("A concept with no commercial content stays non-promotional", () => {
  const i = ConceptStructuringLayer.parse("Ảnh sản phẩm sạch sẽ trên nền trắng");
  assert.strictEqual(i.promotional, false);
  assert.strictEqual(i.offer_type, "none");
  assert.strictEqual(i.cta_required, false);
});

check("An offer or a CTA implies text even when text is never mentioned", () => {
  const i = ConceptStructuringLayer.parse("poster sale 50%");
  assert.strictEqual(i.text_required, true, "a sale poster that states no number is not a sale poster");
});

// ── Task 2: copy synthesis ────────────────────────────────────────────────

check("Copy is synthesized when the concept requires text and none was supplied", () => {
  const intent = ConceptStructuringLayer.parse(PRODUCTION_CONCEPT);
  const copy = CommercialCopySynthesizer.synthesize(PRODUCTION_CONCEPT, intent, [], "Kem dưỡng da");
  assert.strictEqual(copy.language, "vi", "a Vietnamese concept produced non-Vietnamese copy");
  assert.strictEqual(copy.synthesized, true);
  const headline = copy.items.find((i) => i.role === "headline");
  const cta = copy.items.find((i) => i.role === "cta");
  assert.ok(headline?.text.includes("50%"), `headline lost the discount: "${headline?.text}"`);
  assert.ok(cta && cta.text.length > 0, "no CTA was composed for a concept that demanded one");
});

check("Supplied copy is used verbatim and never rewritten", () => {
  const intent = ConceptStructuringLayer.parse(PRODUCTION_CONCEPT);
  const copy = CommercialCopySynthesizer.synthesize(PRODUCTION_CONCEPT, intent, ["ĐẠI TIỆC SALE"], "Kem");
  const headline = copy.items.find((i) => i.role === "headline");
  assert.strictEqual(headline?.text, "ĐẠI TIỆC SALE");
  assert.strictEqual(headline?.supplied, true);
});

check("No offer in the concept means no offer is invented", () => {
  // "Tạo thumbnail nổi bật, text ngắn, dễ đọc" was answered with "ƯU ĐÃI ĐẶC
  // BIỆT" — a promotion the client never mentioned.
  const concept = "Tạo thumbnail nổi bật, text ngắn, dễ đọc";
  const intent = ConceptStructuringLayer.parse(concept);
  const copy = CommercialCopySynthesizer.synthesize(concept, intent, [], "Khoá học online");
  for (const item of copy.items) {
    assert.ok(
      !/ưu đãi|giảm|sale|offer|khuyến mãi/i.test(item.text),
      `invented an offer: ${item.role} = "${item.text}"`
    );
  }
});

check("An English concept gets English copy", () => {
  const concept = "Create a poster, 50% off sale with a CTA button";
  const intent = ConceptStructuringLayer.parse(concept);
  const copy = CommercialCopySynthesizer.synthesize(concept, intent, [], "Face cream");
  assert.strictEqual(copy.language, "en");
  assert.ok(copy.items.some((i) => i.role === "cta" && /SHOP NOW/i.test(i.text)));
});

// ── Tasks 3 & 4: execution mode and text enforcement ──────────────────────

check("The production case now demands visible text", () => {
  const pkg = CreativeDirectorPipeline.run({ ...BRIEF, concept: PRODUCTION_CONCEPT });
  const p = pkg.assembled.prompt;
  assert.ok(/\[TEXT RENDERING — REQUIRED, NOT OPTIONAL\]/.test(p), "no text rendering section");
  assert.ok(
    !/no text is rendered in this pass/i.test(p),
    "the prompt still tells the renderer not to draw text"
  );
  assert.ok(p.includes("50%"), "the discount is absent from the prompt");
  for (const item of pkg.copy.items) {
    assert.ok(p.includes(item.text), `copy absent from prompt: "${item.text}"`);
  }
});

check("A sale poster uses promotional hierarchy, not product-hero hierarchy", () => {
  const pkg = CreativeDirectorPipeline.run({ ...BRIEF, concept: PRODUCTION_CONCEPT });
  assert.strictEqual(pkg.execution.mode, "promotional");
  assert.ok(/Promotional composition:/.test(pkg.assembled.prompt), "hero composition was used");
  assert.ok(
    pkg.execution.hierarchy[0].includes("discount"),
    `the discount does not lead the hierarchy: ${pkg.execution.hierarchy[0]}`
  );
  assert.ok(/COMMERCIAL INTENT/.test(pkg.assembled.prompt), "the commercial intent was not stated");
});

check("A non-promotional concept keeps product-hero execution", () => {
  const pkg = CreativeDirectorPipeline.run({
    ...BRIEF,
    concept: "Ảnh sản phẩm sạch sẽ trên nền trắng",
  });
  assert.strictEqual(pkg.execution.mode, "product_hero");
  assert.ok(!/Promotional composition:/.test(pkg.assembled.prompt), "a plain product shot got a sale layout");
});

check("The concept's asset type overrides the caller's", () => {
  // The user typed "poster"; the form said thumbnail.
  const pkg = CreativeDirectorPipeline.run({ ...BRIEF, format: "thumbnail", concept: PRODUCTION_CONCEPT });
  assert.strictEqual(pkg.format_plan.format, "poster");
});

check("Packaging never receives promotional overlay", () => {
  // Adding a sale burst to a pack face is redesigning the packaging.
  const pkg = CreativeDirectorPipeline.run({
    ...BRIEF,
    format: "packaging",
    concept: "packaging sale 50% có CTA",
  });
  assert.strictEqual(pkg.execution.mode, "product_hero");
  assert.ok(
    pkg.execution.notes.some((n) => /redesign the packaging/i.test(n)),
    "the suppression was not explained"
  );
});

// ── Task 5: identity under design stress ──────────────────────────────────

check("Promotional output restates the identity lock against design pressure", () => {
  const pkg = CreativeDirectorPipeline.run({ ...BRIEF, concept: PRODUCTION_CONCEPT });
  const p = pkg.assembled.prompt;
  assert.ok(/PRODUCT PRESERVATION UNDER PROMOTIONAL DESIGN/.test(p), "no stress section");
  for (const needle of [
    "exact shape",
    "exact packaging proportions",
    "exact label placement",
    "exact brand name",
    "exact product colour",
    "exact material appearance",
  ]) {
    assert.ok(p.includes(needle), `the lock does not hold "${needle}"`);
  }
  assert.ok(/Do not add a promotional sticker/i.test(p), "nothing forbids stickering the product");
});

// ── Task 6: budget V3.1 ───────────────────────────────────────────────────

check("The budget is the corrected V3.1 budget", () => {
  assert.strictEqual(V3_BUDGET.hard_limit, 20000);
  assert.strictEqual(V3_BUDGET.soft_warning, 17000);
  assert.strictEqual(V3_BUDGET.target_min, 14000);
  assert.strictEqual(V3_BUDGET.target_max, 18000);
});

check("Every commercial P0 section survives an enormous P2 tier", () => {
  const huge = Array.from({ length: 600 }, (_, i) => `Craft note ${i}: ${"detail ".repeat(20)}`);
  const pkg = CreativeDirectorPipeline.run({ ...BRIEF, concept: PRODUCTION_CONCEPT }, huge);
  for (const id of [
    "product_identity",
    "commercial_intent",
    "text_rendering",
    "identity_under_stress",
    "camera",
    "lighting",
    "composition",
  ]) {
    assert.ok(pkg.assembled.included.includes(id), `P0 section "${id}" was dropped`);
  }
  assert.ok(pkg.assembled.chars <= V3_BUDGET.hard_limit, `assembled ${pkg.assembled.chars}`);
  assert.ok(pkg.assembled.omitted.some((o) => o.priority === "P2"), "P2 was not what paid for the budget");
});

check("Assembly stays deterministic", () => {
  const a = CreativeDirectorPipeline.run({ ...BRIEF, concept: PRODUCTION_CONCEPT });
  const b = CreativeDirectorPipeline.run({ ...BRIEF, concept: PRODUCTION_CONCEPT });
  assert.strictEqual(a.assembled.prompt, b.assembled.prompt);
});

console.log("\n" + "=".repeat(74));
console.log(`${passed} passed, ${failed} failed`);
console.log("=".repeat(74));
if (failed > 0) {
  console.log("\nFailures:");
  failures.forEach((f) => console.log("  - " + f));
  process.exit(1);
}
