import { buildProductMeaning } from "./evolution/experiment/ProductMeaning";
import { buildMarketingInsight } from "./evolution/experiment/MarketingInsight";
import { ProfessionalCreativeBrain } from "./evolution/experiment/ProfessionalCreativeBrain";
import { CreativeRefinementLoop } from "./evolution/experiment/CreativeRefinementLoop";
import { RenderQualityJudge } from "./benchmark/RenderQualityJudge";
import { assetContextFor } from "./evolution/experiment/AssetContext";
import type { ProductTruth } from "./evolution/experiment/ProductTruth";

/**
 * The commercial design benchmark — before vs after, offline and free.
 *
 *   npx tsx lib/image-engine/run-commercial-design-benchmark.ts
 *
 * Five subjects with nothing in common, because a design system that only
 * works on one kind of product is a house style with extra steps. No category
 * logic exists anywhere in the code under test; these three exist to prove that
 * by producing comparable results.
 *
 * BEFORE  ProductTruth + CreativeDirector, which is what the pipeline carried
 *         before the design layers existed.
 * AFTER   ProductTruth + ProductMeaning + MarketingInsight + LayoutArchitect
 *         + ProfessionalCreativeBrain + the refinement loop.
 *
 * What the numbers are
 * --------------------
 * Readiness, not beauty. Every dimension is answerable from the blueprint and
 * the prompt without seeing a render, which is exactly why this can run on
 * every commit for nothing. It says how much was DECIDED before the render. It
 * does not say the poster is good, and no number here should ever be quoted as
 * if it did.
 */

interface Subject {
  id: string;
  /** Plain description, for the report. Never read by the code under test. */
  note: string;
  assetType: string;
  truth: ProductTruth;
  observed: Record<string, unknown>;
  copyRoles: { text: string; role: string; reason: string }[];
  /** The director's output, deliberately terse — matching measured reality. */
  camera: string;
  lighting: string;
  composition: string;
  typography: string;
}

const claim = (value: string, provenance: string, basis: string): any => ({ value, provenance, basis });
const absent = (why: string): any => ({ value: "", provenance: "ABSENT", basis: why });

const truthFor = (declared: string, sensory: string): ProductTruth =>
  ({
    functional_truth: claim(declared, "DECLARED", `"${declared}"`),
    differentiation: absent("no DERIVED tier before ProductMeaning"),
    sensory: claim(sensory, "OBSERVED", "VisualDNA.observed.product"),
    emotional_value: absent("no DERIVED tier before ProductMeaning"),
    usage_context: absent("nothing supplied"),
    completeness: 0.4,
  }) as ProductTruth;

const SUBJECTS: Subject[] = [
  {
    id: "skincare",
    note: "serum, glass dropper bottle",
    assetType: "poster",
    truth: truthFor("cô đặc 12 giờ, không hương liệu", "frosted glass, matte dropper"),
    observed: { form: "a slim dropper bottle", materials: ["frosted glass"], palette: ["oat", "clear"], finish: "matte", surface_detail: "a printed band" },
    copyRoles: [
      { text: "Da khoẻ mỗi sáng", role: "HEADLINE", reason: "the promise" },
      { text: "Tìm hiểu", role: "CTA", reason: "closes it" },
    ],
    camera: "the camera stays at the height a hand would hold it",
    lighting: "one soft source from the left",
    composition: "the bottle slightly left of centre",
    typography: "the words should read quietly, not sell",
  },
  {
    id: "beverage",
    note: "cold brew, amber bottle",
    assetType: "social_ad",
    truth: truthFor("ủ lạnh 18 tiếng, không dùng nhiệt", "amber glass, matte label paper"),
    observed: { form: "a straight-sided bottle", materials: ["amber glass", "wood"], palette: ["amber", "cream"], finish: "matte label paper", surface_detail: "a printed paper band" },
    copyRoles: [
      { text: "Mua 2 tặng 1", role: "OFFER", reason: "the offer leads" },
      { text: "Trước 10h", role: "SUPPORTING_TEXT", reason: "the condition" },
      { text: "Ghé thử", role: "CTA", reason: "closes it" },
    ],
    camera: "the camera stays where a customer would stand",
    lighting: "hard morning window light",
    composition: "the bottles lead, the cup follows",
    typography: "the offer has to read before anything else",
  },
  {
    id: "perfume",
    note: "eau de parfum, heavy glass flacon",
    assetType: "product_hero",
    truth: truthFor("chiet xuat trong 6 tuan", "thick clear glass, weighted cap"),
    observed: { form: "a squat rectangular flacon", materials: ["clear glass"], palette: ["amber", "gold"], finish: "polished", surface_detail: "a foil-stamped shoulder" },
    copyRoles: [{ text: "Sau tuan", role: "HEADLINE", reason: "the process is the claim" }],
    camera: "square to the flacon at its own height",
    lighting: "one hard source, deliberate shadow",
    composition: "centred, nothing else in frame",
    typography: "as few words as the frame can carry",
  },
  {
    id: "technology",
    note: "wireless earbuds, matte case",
    assetType: "banner",
    truth: truthFor("sac nhanh 10 phut dung 4 gio", "matte polycarbonate, seamless lid"),
    observed: { form: "a rounded pebble case", materials: ["matte polycarbonate"], palette: ["graphite", "white"], finish: "soft-touch matte", surface_detail: "a seamless hinge line" },
    copyRoles: [
      { text: "10 phut = 4 gio", role: "HEADLINE", reason: "the number is the offer" },
      { text: "Mua ngay", role: "CTA", reason: "closes it" },
    ],
    camera: "three-quarter, slightly above",
    lighting: "even, two soft sources",
    composition: "case right, copy left",
    typography: "the number has to read at a glance",
  },
  {
    id: "food",
    note: "bowl of pho, ceramic",
    assetType: "banner",
    truth: truthFor("nước dùng ninh 14 tiếng từ xương bò", "glazed ceramic, wide rim"),
    observed: { form: "a wide glazed bowl", materials: ["glazed ceramic"], palette: ["off-white", "clay"], finish: "glossy", surface_detail: "a hand-thrown rim" },
    copyRoles: [
      { text: "Ninh 14 tiếng", role: "HEADLINE", reason: "the process is the claim" },
      { text: "Đặt bàn", role: "CTA", reason: "closes it" },
    ],
    camera: "looking down at the bowl the way a diner does",
    lighting: "overhead, warm",
    composition: "the bowl fills the right, copy on the left",
    typography: "the words should feel handwritten on a board",
  },
];

const decisionFor = (s: Subject): any => ({
  selected_direction: "the process, made visible",
  creative_goal: "make the process the reason to choose it",
  visual_story: "the product mid-use, not staged",
  scene_definition: "a working surface, nothing styled",
  camera_decision: s.camera,
  lighting_decision: s.lighting,
  composition_decision: s.composition,
  typography_decision: s.typography,
  environment_decision: "a real place, mid-service",
  important_visual_elements: [],
  avoid_elements: [],
  brand_context: "a small maker",
  audience_context: "people who already walk past it",
  element_meanings: [],
  deliberately_avoided: "the styled flat-lay, which would have made it a catalogue picture",
  copy_roles: s.copyRoles,
  strategy_route: "prove the process",
  strategy_reason: "the process is the only thing a competitor cannot copy",
  product_relationship: "",
  staging_requirements: [],
});

/** The protected prompt, as the compiler now emits it. */
const PROTECTED_PROMPT = [
  "- PRODUCT IDENTITY PROTECTION — the product is photographed, never redesigned:",
  "These strings are campaign copy. They belong to the layout, not to the product:",
  "A blank, partial or illegible label is a failed render, not a clean one.",
].join("\n");

function run() {
  console.log("\n" + "=".repeat(78));
  console.log("Commercial Design Benchmark — BEFORE vs AFTER");
  console.log("=".repeat(78));
  console.log("\nReadiness scores: how much was decided before the render.");
  console.log("They do not say the poster is good. Only a human looking at it can.\n");

  const rows: { id: string; dim: string; before: number; after: number }[] = [];
  const refine: { id: string; improved: boolean; delta: number; problems: number; corrected: number; healthy_found: number }[] = [];

  for (const s of SUBJECTS) {
    const dna: any = { observed: { product: s.observed }, inferred: [], provenance: {} };
    const decision = decisionFor(s);

    // BEFORE — ProductTruth + CreativeDirector only.
    const beforeBp = ProfessionalCreativeBrain.assemble({
      productTruth: s.truth,
      decision,
      judgment: null,
    });
    const before = RenderQualityJudge.evaluate({ blueprint: beforeBp, prompt: PROTECTED_PROMPT });
    // The loop against the DEGRADED arm. On a healthy blueprint it correctly
    // finds nothing; its value is as a safety net over a thin one, so that is
    // where it has to be measured.
    const rescue = CreativeRefinementLoop.run({ productTruth: s.truth, decision, judgment: null, prompt: PROTECTED_PROMPT });

    // AFTER — the full stack.
    const meaning = buildProductMeaning({ productTruth: s.truth, visualDNA: dna });
    const insight = buildMarketingInsight({ productTruth: s.truth, productMeaning: meaning });
    const loop = CreativeRefinementLoop.run({
      productTruth: s.truth,
      productMeaning: meaning,
      marketingInsight: insight,
      visualDNA: dna,
      decision,
      judgment: null,
      assetContext: assetContextFor(s.assetType) as any,
      productCount: 1,
      hasLogo: false,
      prompt: PROTECTED_PROMPT,
    });
    const after = loop.after;
    refine.push({
      id: s.id,
      improved: rescue.improved,
      delta: rescue.delta,
      problems: rescue.critique.diagnosis.length,
      corrected: Object.keys(rescue.corrections).length,
      healthy_found: loop.critique.diagnosis.length,
    });

    console.log("-".repeat(78));
    console.log(`${s.id.toUpperCase().padEnd(10)} ${s.note}   [${s.assetType}]`);
    console.log("-".repeat(78));
    for (const dim of before.scores.map((x) => x.dimension)) {
      const b = before.scores.find((x) => x.dimension === dim)!.score;
      const a = after.scores.find((x) => x.dimension === dim)!.score;
      const arrow = a > b ? `+${Math.round((a - b) * 10) / 10}` : a < b ? `${Math.round((a - b) * 10) / 10}` : "  =";
      console.log(`  ${dim.padEnd(38)} ${String(b).padStart(5)} → ${String(a).padStart(5)}   ${arrow}`);
      rows.push({ id: s.id, dim, before: b, after: a });
    }
    console.log(`  ${"MEAN".padEnd(38)} ${String(before.mean).padStart(5)} → ${String(after.mean).padStart(5)}`);
    console.log(
      `  grounded ${beforeBp.metrics.grounded_in_product_score} → ${loop.blueprint.metrics.grounded_in_product_score} in product` +
        `   ·   ${beforeBp.missing.length} → ${loop.blueprint.missing.length} fields undecided`
    );
  }

  console.log("\n" + "=".repeat(78));
  console.log("ACROSS ALL FIVE SUBJECTS");
  console.log("=".repeat(78));
  const dims = [...new Set(rows.map((r) => r.dim))];
  for (const dim of dims) {
    const rs = rows.filter((r) => r.dim === dim);
    const b = Math.round((rs.reduce((n, r) => n + r.before, 0) / rs.length) * 100) / 100;
    const a = Math.round((rs.reduce((n, r) => n + r.after, 0) / rs.length) * 100) / 100;
    console.log(`  ${dim.padEnd(38)} ${String(b).padStart(5)} → ${String(a).padStart(5)}   ${a > b ? "+" : ""}${Math.round((a - b) * 100) / 100}`);
  }
  const mb = Math.round((rows.reduce((n, r) => n + r.before, 0) / rows.length) * 100) / 100;
  const ma = Math.round((rows.reduce((n, r) => n + r.after, 0) / rows.length) * 100) / 100;
  console.log(`  ${"OVERALL".padEnd(38)} ${String(mb).padStart(5)} → ${String(ma).padStart(5)}   +${Math.round((ma - mb) * 100) / 100}`);

  // Consistency across subjects is the claim that matters most: a system with
  // a hidden category table would score unevenly here.
  const spread = (key: "before" | "after") => {
    const means = SUBJECTS.map((s) => {
      const rs = rows.filter((r) => r.id === s.id);
      return rs.reduce((n, r) => n + r[key], 0) / rs.length;
    });
    return Math.round((Math.max(...means) - Math.min(...means)) * 100) / 100;
  };
  console.log("\n" + "=".repeat(78));
  console.log("REFINEMENT LOOP - run against the DEGRADED arm, where it has work to do");
  console.log("=".repeat(78));
  for (const r of refine) {
    console.log(
      `  ${r.id.padEnd(12)} ${r.problems} diagnosed, ${r.corrected} corrected   ` +
        (r.improved ? `readiness +${r.delta}` : "no improvable gap") +
        `   (on the full stack it finds ${r.healthy_found})`
    );
  }

  console.log(`\n  spread across subjects: ${spread("before")} → ${spread("after")}`);
  console.log("  (a smaller spread means the system treats three unrelated products alike,");
  console.log("   which is what having no category table is supposed to produce)\n");
}

run();
